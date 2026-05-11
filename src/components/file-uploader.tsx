
"use client";

import { useState, ChangeEvent, DragEvent, ReactNode, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { UploadCloud, FileImage, Loader2, Sparkles, Download, HelpCircle, Info } from 'lucide-react';
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Spectral_r colormap forward LUT: 256 grayscale -> RGB (from matplotlib)
const SPECTRAL_R_FORWARD_LUT: Uint8Array = (() => {
    const lut = new Uint8Array(256 * 3);
    const stops: [number, number, number][] = [[94,79,162],[92,81,163],[90,83,164],[88,85,165],[87,87,166],[85,90,167],[83,92,168],[81,94,169],[80,96,170],[78,99,171],[76,101,172],[75,103,173],[73,105,174],[71,108,175],[69,110,176],[68,112,177],[66,114,178],[64,117,180],[62,119,181],[61,121,182],[59,123,183],[57,125,184],[56,128,185],[54,130,186],[52,132,187],[50,134,188],[51,137,188],[53,139,187],[55,141,186],[57,143,185],[59,146,184],[61,148,183],[63,150,182],[65,153,181],[67,155,181],[69,157,180],[71,159,179],[73,162,178],[75,164,177],[77,166,176],[79,168,175],[81,171,174],[83,173,173],[85,175,172],[87,178,171],[89,180,170],[91,182,169],[93,184,168],[95,187,167],[97,189,166],[99,191,165],[102,194,165],[104,195,164],[107,196,164],[110,197,164],[112,198,164],[115,199,164],[118,200,164],[120,201,164],[123,202,164],[126,203,164],[129,204,164],[131,205,164],[134,206,164],[137,207,164],[139,208,164],[142,209,164],[145,210,164],[148,212,164],[150,213,164],[153,214,164],[156,215,164],[158,216,164],[161,217,164],[164,218,164],[166,219,164],[169,220,164],[172,221,163],[174,222,163],[176,223,162],[179,224,162],[181,225,161],[183,226,161],[186,227,160],[188,228,160],[190,229,160],[192,229,159],[195,230,159],[197,231,158],[199,232,158],[202,233,157],[204,234,157],[206,235,156],[209,236,156],[211,237,155],[213,238,155],[216,239,154],[218,240,154],[220,241,153],[223,242,153],[225,243,152],[227,244,152],[230,245,152],[230,245,153],[231,245,155],[232,246,156],[233,246,158],[234,246,159],[235,247,161],[236,247,162],[237,248,164],[238,248,165],[239,248,167],[240,249,168],[241,249,170],[242,250,171],[243,250,173],[244,250,174],[245,251,176],[246,251,178],[247,252,179],[248,252,181],[249,252,182],[250,253,184],[251,253,185],[252,254,187],[253,254,188],[254,254,190],[254,254,189],[254,253,187],[254,251,185],[254,250,183],[254,249,181],[254,248,179],[254,247,177],[254,245,175],[254,244,173],[254,243,171],[254,242,169],[254,241,167],[254,239,165],[254,238,163],[254,237,161],[254,236,159],[254,234,157],[254,233,155],[254,232,153],[254,231,151],[254,230,149],[254,228,147],[254,227,145],[254,226,143],[254,225,141],[254,224,139],[253,222,137],[253,220,135],[253,218,134],[253,216,132],[253,214,130],[253,212,129],[253,210,127],[253,208,125],[253,206,124],[253,204,122],[253,202,120],[253,200,119],[253,198,117],[253,196,115],[253,194,114],[253,192,112],[253,190,111],[253,188,109],[253,186,107],[253,184,106],[253,182,104],[253,180,102],[253,178,101],[253,176,99],[253,174,97],[252,172,96],[252,170,95],[252,167,94],[251,165,92],[251,162,91],[251,159,90],[250,157,89],[250,154,88],[250,152,87],[249,149,85],[249,147,84],[248,144,83],[248,142,82],[248,139,81],[247,137,79],[247,134,78],[247,131,77],[246,129,76],[246,126,75],[246,124,74],[245,121,72],[245,119,71],[245,116,70],[244,114,69],[244,111,68],[244,109,67],[242,107,67],[241,105,67],[240,103,68],[239,101,68],[237,99,69],[236,97,69],[235,96,70],[234,94,70],[233,92,71],[231,90,71],[230,88,72],[229,86,72],[228,85,73],[226,83,73],[225,81,74],[224,79,74],[223,77,75],[222,75,75],[220,73,75],[219,72,76],[218,70,76],[217,68,77],[216,66,77],[214,64,78],[213,62,78],[211,60,78],[209,58,78],[207,56,77],[205,53,77],[203,51,76],[201,48,76],[198,46,75],[196,44,75],[194,41,74],[192,39,74],[190,36,73],[188,34,73],[186,32,72],[183,29,72],[181,27,71],[179,24,71],[177,22,70],[175,20,70],[173,17,69],[170,15,69],[168,12,68],[166,10,68],[164,8,67],[162,5,67],[160,3,66],[158,1,66]];
    for (let i = 0; i < 256; i++) {
        lut[i * 3] = stops[i][0];
        lut[i * 3 + 1] = stops[i][1];
        lut[i * 3 + 2] = stops[i][2];
    }
    return lut;
})();

function convertColoredDepthToGrayscale(imageData: ImageData): ImageData {
    const { data, width, height } = imageData;
    const gray = new Uint8ClampedArray(width * height);
    const lut = SPECTRAL_R_FORWARD_LUT;

    for (let i = 0; i < width * height; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];

        let bestIdx = 0;
        let bestDist = Infinity;
        // Find closest color in Spectral_r LUT
        for (let j = 0; j < 256; j++) {
            const lr = lut[j * 3];
            const lg = lut[j * 3 + 1];
            const lb = lut[j * 3 + 2];
            const dr = r - lr;
            const dg = g - lg;
            const db = b - lb;
            const dist = dr * dr + dg * dg + db * db;
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = j;
            }
        }
        gray[i] = bestIdx;
    }

    // Convert single-channel grayscale to RGBA
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        rgba[i * 4] = gray[i];
        rgba[i * 4 + 1] = gray[i];
        rgba[i * 4 + 2] = gray[i];
        rgba[i * 4 + 3] = 255;
    }
    return new ImageData(rgba, width, height);
}

interface FileUploaderProps {
    onFilesSelected: (image: File, depthMap: File) => void;
}

interface FileInputBoxProps {
    id: string;
    onFileSelect: (file: File) => void;
    acceptedFile: File | null;
    label: string;
    description: string;
    icon: ReactNode;
    showGenerateButton?: boolean;
    onGenerateClick?: () => void;
    isGenerating?: boolean;
    isLocalGenerating?: boolean;
    showHelpButton?: boolean;
    helpDialogContent?: ReactNode;
}

const FileInputBox = ({ 
    id, 
    onFileSelect, 
    acceptedFile, 
    label, 
    description, 
    icon, 
    showGenerateButton, 
    onGenerateClick, 
    isGenerating, 
    isLocalGenerating,
    showHelpButton,
    helpDialogContent
}: FileInputBoxProps) => {
    const [isDragging, setIsDragging] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (acceptedFile) {
            const url = URL.createObjectURL(acceptedFile);
            setPreviewUrl(url);

            return () => {
                URL.revokeObjectURL(url);
                setPreviewUrl(null);
            };
        } else {
            setPreviewUrl(null);
        }
    }, [acceptedFile]);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            onFileSelect(e.target.files[0]);
        }
    };

    const handleDragEnter = (e: DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            onFileSelect(e.dataTransfer.files[0]);
        }
    };

    return (
        <div className="space-y-2">
            <div className='flex items-center justify-between h-9'>
                <div className="flex items-center gap-2">
                    <label htmlFor={id} className="block text-sm font-medium text-foreground">{label}</label>
                </div>
                <div className="flex items-center gap-2">
                    {description && !showGenerateButton && (
                         <p className="text-xs text-muted-foreground">{description}</p>
                    )}
                    {showGenerateButton && onGenerateClick && (
                         <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={onGenerateClick} 
                            disabled={!acceptedFile || isGenerating || isLocalGenerating}
                            className="text-xs"
                        >
                            {isGenerating || isLocalGenerating ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Sparkles className="mr-2 h-4 w-4" />
                            )}
                            生成深度图
                        </Button>
                    )}
                    {showHelpButton && helpDialogContent && (
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                    <HelpCircle className="h-4 w-4" />
                                </Button>
                            </DialogTrigger>
                            {helpDialogContent}
                        </Dialog>
                    )}
                </div>
            </div>
            <label
                htmlFor={id}
                className={cn(
                    "relative group flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-muted/50 border-border transition-colors overflow-hidden",
                    isDragging && "border-primary bg-primary/10"
                )}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragEnter}
                onDrop={handleDrop}
            >
                 {acceptedFile && previewUrl ? (
                    <>
                        <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-sm text-white font-semibold max-w-full truncate px-2">{acceptedFile.name}</p>
                            <p className="text-xs text-gray-300">点击或拖动来更换</p>
                        </div>
                        <a
                            href={previewUrl}
                            download={acceptedFile.name}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white hover:bg-black/80 transition-colors"
                        >
                            <Download className="w-4 h-4" />
                        </a>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                        {icon}
                        <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold text-primary">点击上传</span> 或拖放文件</p>
                        <p className="text-xs text-muted-foreground">支持 PNG, JPG, 或 WEBP</p>
                    </div>
                )}
                <input id={id} type="file" className="hidden" onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" />
            </label>
        </div>
    );
};

export function FileUploader({ onFilesSelected }: FileUploaderProps) {
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [depthMapFile, setDepthMapFile] = useState<File | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const { toast } = useToast();
    const defaultApiUrl = 'https://depth-anything-depth-anything-v2.hf.space/gradio_api';
    const [apiUrl, setApiUrl] = useState(defaultApiUrl);
    
    // Local generation state
    const [useLocalGenerator, setUseLocalGenerator] = useState(false);
    const [useMirror, setUseMirror] = useState(false);
    const [isLocalGenerating, setIsLocalGenerating] = useState(false);
    const [localModelStatus, setLocalModelStatus] = useState('未初始化');
    const [localModelName, setLocalModelName] = useState('onnx-community/depth-anything-v2-small');
    const [localGeneratorDevice, setLocalGeneratorDevice] = useState('未知');
    const workerRef = useRef<Worker>();


    useEffect(() => {
        try {
            let savedApiUrl = localStorage.getItem('depthApiUrl');
            // 迁移旧的默认地址：补上 /gradio_api 后缀
            if (savedApiUrl && savedApiUrl === 'https://depth-anything-depth-anything-v2.hf.space') {
                savedApiUrl = 'https://depth-anything-depth-anything-v2.hf.space/gradio_api';
                localStorage.setItem('depthApiUrl', savedApiUrl);
            }
            if (savedApiUrl) setApiUrl(savedApiUrl);
            
            const savedUseLocal = localStorage.getItem('useLocalGenerator');
            if(savedUseLocal) setUseLocalGenerator(JSON.parse(savedUseLocal));

            const savedUseMirror = localStorage.getItem('useMirror');
            if(savedUseMirror) setUseMirror(JSON.parse(savedUseMirror));

            const savedModelName = localStorage.getItem('localModelName');
            if (savedModelName) setLocalModelName(savedModelName);
            
        } catch (error) {
            console.error("Failed to read from localStorage", error);
        }

        // Initialize worker
        workerRef.current = new Worker(new URL('../workers/depth-worker.ts', import.meta.url));

        const onMessageReceived = (e: MessageEvent) => {
            const { type, payload } = e.data;
            switch(type) {
                case 'status':
                    setLocalModelStatus(payload);
                    if (payload === '正在生成深度图...') {
                        setIsLocalGenerating(true);
                    }
                    break;
                case 'device-info':
                    setLocalGeneratorDevice(payload === 'webgpu' ? 'webgpu' : 'wasm (CPU)');
                    break;
                case 'result':
                    const { depth } = payload;
                    const canvas = document.createElement('canvas');
                    canvas.width = depth.width;
                    canvas.height = depth.height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error('Could not get canvas context');
                    
                    const imageData = new ImageData(new Uint8ClampedArray(depth.data), depth.width, depth.height);
                    ctx.putImageData(imageData, 0, 0);

                    canvas.toBlob((blob) => {
                        if (blob) {
                            const generatedFile = new File([blob], "generated-depth-map.png", { type: "image/png" });
                            setDepthMapFile(generatedFile);
                            toast({ title: "成功", description: "深度图已在本地生成并载入。" });
                        } else {
                            throw new Error("Canvas to Blob conversion failed.");
                        }
                        setIsLocalGenerating(false);
                        setLocalModelStatus('就绪');
                    }, 'image/png');
                    break;
                case 'error':
                    toast({ variant: "destructive", title: "Worker 错误", description: payload });
                    setIsLocalGenerating(false);
                    setLocalModelStatus('错误');
                    break;
            }
        };

        workerRef.current.addEventListener('message', onMessageReceived);
        
        // Pre-check environment
        workerRef.current.postMessage({ type: 'init', payload: { model: 'pre-check' } });


        // Cleanup
        return () => {
            workerRef.current?.removeEventListener('message', onMessageReceived);
            workerRef.current?.terminate();
        }
    }, [toast]);

    const initializeLocalGenerator = useCallback(() => {
        if (!workerRef.current) return;
        setLocalModelStatus('正在准备环境...');
        workerRef.current.postMessage({
            type: 'init',
            payload: { model: localModelName, useMirror }
        });
    }, [localModelName, useMirror]);

    useEffect(() => {
        if (useLocalGenerator) {
            initializeLocalGenerator();
        }
    }, [useLocalGenerator, localModelName, useMirror, initializeLocalGenerator]);

    
    const handleUseLocalChange = (checked: boolean) => {
        setUseLocalGenerator(checked);
        try {
            localStorage.setItem('useLocalGenerator', JSON.stringify(checked));
        } catch (error) {
            console.error("Failed to write to localStorage", error);
        }
    }
    
    const handleUseMirrorChange = (checked: boolean) => {
        setUseMirror(checked);
        try {
            localStorage.setItem('useMirror', JSON.stringify(checked));
        } catch (error) {
            console.error("Failed to write to localStorage", error);
        }
    }

    const handleLocalModelChange = (model: string) => {
        setLocalModelName(model);
        try {
            localStorage.setItem('localModelName', model);
        } catch (error) {
            console.error("Failed to write to localStorage", error);
        }
    }

    const handleSubmit = async () => {
        if (imageFile && depthMapFile) {
            onFilesSelected(imageFile, depthMapFile);
        }
    };
    
    const handleGenerateClick = () => {
        if (useLocalGenerator) {
            handleLocalGenerateDepthMap();
        } else {
            handleRemoteGenerateDepthMap(apiUrl || defaultApiUrl);
        }
    };

    const handleLocalGenerateDepthMap = useCallback(async () => {
        if (!imageFile || !workerRef.current) return;
        
        if (localModelStatus !== '就绪') {
             toast({ variant: "destructive", title: "本地模型未就绪", description: "请等待模型下载完成或检查设置后重试。" });
             if (localModelStatus === '错误') {
                initializeLocalGenerator();
             }
             return;
        }

        const imageUrl = URL.createObjectURL(imageFile);
        
        setTimeout(() => {
          if(workerRef.current){
             workerRef.current.postMessage({
                type: 'generate',
                payload: { imageUrl }
            });
            // The URL needs to be revoked after the worker has used it.
            // For simplicity, we can do it after a short delay, assuming worker has loaded it.
            setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
          }
        }, 0);


    }, [imageFile, localModelStatus, initializeLocalGenerator, toast]);
    
    const handleRemoteGenerateDepthMap = async (currentApiUrl: string) => {
        if (!imageFile) return;

        setIsGenerating(true);
        const errorHint = "可能的原因：1. 你的网络连接存在问题 2. 达到了API调用频率限制";
        let eventSource: EventSource | null = null;
        
        const effectiveApiUrl = currentApiUrl || defaultApiUrl;
        const isDepthPro = effectiveApiUrl.toLowerCase().includes('depthpro');
        const endpointName = isDepthPro ? 'run' : 'on_submit';

        try {
            const formData = new FormData();
            formData.append('files', imageFile);

            const uploadResponse = await fetch(`${effectiveApiUrl}/upload`, {
                method: 'POST',
                body: formData
            });

            if (!uploadResponse.ok) {
                throw new Error(`文件上传失败，状态码: ${uploadResponse.status}`);
            }

            const uploadResult = await uploadResponse.json();
            if (!uploadResult || !Array.isArray(uploadResult) || !uploadResult[0]) {
                throw new Error('文件上传后未收到有效的文件路径。');
            }
            
            const requestData = {
                data: [{ path: uploadResult[0] }]
            };

            const postResponse = await fetch(`${effectiveApiUrl}/call/${endpointName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });

            if (!postResponse.ok) {
                throw new Error(`启动任务失败，状态码: ${postResponse.status}`);
            }

            const postResult = await postResponse.json();
            const eventId = postResult.event_id;

            if (!eventId) {
                throw new Error('无法从响应中获取 event_id。');
            }

            eventSource = new EventSource(`${effectiveApiUrl}/call/${endpointName}/${eventId}`);
            
            eventSource.addEventListener('complete', async (event) => {
                if (eventSource) eventSource.close();

                const dataStr = (event as MessageEvent).data;
                const outputData = JSON.parse(dataStr);
                
                // DepthPro: outputData[0] is [original, coloredDepth], outputData[1..4] are text
                // Depth-Anything: outputData[0] is [img1, img2] slider, outputData[1] is grayscale depth file
                let depthImageUrl: string | null = null;
                
                if (isDepthPro) {
                    // DepthPro: depth map is the second image in the ImageSlider at outputData[0]
                    if (outputData && Array.isArray(outputData) && outputData.length > 0) {
                        const slider = outputData[0];
                        if (Array.isArray(slider) && slider.length > 1 && slider[1] && slider[1].url) {
                            depthImageUrl = slider[1].url;
                        }
                    }
                } else {
                    // Depth-Anything: depth map is a separate FileData at outputData[1]
                    if (outputData && Array.isArray(outputData) && outputData.length > 1) {
                        const image2 = outputData[1];
                        if (image2 && image2.url) {
                            depthImageUrl = image2.url;
                        }
                    }
                }

                if (!depthImageUrl) {
                    toast({ variant: "destructive", title: "错误", description: `API返回结果格式不正确。 ${errorHint}` });
                    setIsGenerating(false);
                    return;
                }

                try {
                    const imageResponse = await fetch(depthImageUrl);
                    if (!imageResponse.ok) {
                        throw new Error(`下载深度图失败，状态码: ${imageResponse.status}`);
                    }
                    const imageBlob = await imageResponse.blob();
                    
                    if (isDepthPro) {
                        // DepthPro returns colored depth map, convert to grayscale
                        const img = new Image();
                        const objectUrl = URL.createObjectURL(imageBlob);
                        await new Promise<void>((resolve, reject) => {
                            img.onload = () => resolve();
                            img.onerror = () => reject(new Error('加载深度图失败'));
                            img.src = objectUrl;
                        });
                        URL.revokeObjectURL(objectUrl);
                        
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        if (!ctx) throw new Error('无法创建Canvas上下文');
                        ctx.drawImage(img, 0, 0);
                        
                        const coloredData = ctx.getImageData(0, 0, img.width, img.height);
                        const grayData = convertColoredDepthToGrayscale(coloredData);
                        
                        ctx.putImageData(grayData, 0, 0);
                        const grayBlob = await new Promise<Blob>((resolve, reject) => {
                            canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Canvas转换失败')), 'image/png');
                        });
                        
                        const generatedFile = new File([grayBlob], "generated-depth-map.png", { type: "image/png" });
                        setDepthMapFile(generatedFile);
                    } else {
                        const generatedFile = new File([imageBlob], "generated-depth-map.png", { type: imageBlob.type });
                        setDepthMapFile(generatedFile);
                    }
                    
                    toast({ title: "成功", description: "深度图已生成并载入。" });
                } catch(e) {
                     if (e instanceof Error) {
                        toast({ variant: "destructive", title: "错误", description: `下载生成的深度图时出错: ${e.message}. ${errorHint}` });
                    }
                }
                setIsGenerating(false);
            });


            eventSource.onerror = (err) => {
                console.error("EventSource failed:", err);
                if (eventSource) eventSource.close();
                toast({ variant: "destructive", title: "错误", description: `获取结果时发生错误。 ${errorHint}` });
                setIsGenerating(false);
            };

        } catch (error) {
            if (eventSource) eventSource.close();
            console.error("生成深度图时出错:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            toast({ 
                variant: "destructive", 
                title: "生成深度图时出错", 
                description: `${errorMessage}. ${errorHint}` 
            });
            setIsGenerating(false);
        }
    };

    const helpDialogContent = (
         <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="sm:max-w-[525px] max-h-[80vh] flex flex-col">
            <DialogHeader>
                <DialogTitle>关于“生成深度图”</DialogTitle>
                <DialogDescription asChild>
                   <div>
                        此功能将照片发送到以下API地址进行处理，这是一个开源模型，你也可以查阅
                        <a 
                            href="https://huggingface.co/spaces/depth-anything/Depth-Anything-V2" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-primary underline hover:text-primary/80"
                        >
                            官方文档
                        </a>
                        本地部署。
                   </div>
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 overflow-y-auto px-1">
                <div className="space-y-2">
                    <Label htmlFor="api-url" className="text-sm font-bold">
                        服务器API 地址
                    </Label>
                    <button
                        type="button"
                        className="text-sm text-primary underline cursor-pointer hover:text-primary/80"
                        onClick={() => {
                            const isDepthPro = apiUrl.toLowerCase().includes('depthpro');
                            const newUrl = isDepthPro
                                ? 'https://depth-anything-depth-anything-v2.hf.space/gradio_api'
                                : 'https://hysts-depthpro-transformers.hf.space/gradio_api';
                            setApiUrl(newUrl);
                            try { localStorage.setItem('depthApiUrl', newUrl); } catch (error) { console.error("Failed to save apiUrl to localStorage", error); }
                        }}
                    >
                        {apiUrl.toLowerCase().includes('depthpro') ? '切换回 Depth Anything V2' : '切换到 Depth Pro'}
                    </button>
                    <Input
                        id="api-url"
                        value={apiUrl}
                        onChange={(e) => {
                            setApiUrl(e.target.value);
                            try { localStorage.setItem('depthApiUrl', e.target.value); } catch (error) { console.error("Failed to save apiUrl to localStorage", error); }
                        }}
                        placeholder={defaultApiUrl}
                    />
                </div>
                <Separator className="my-4"/>
                <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                        <Switch id="local-generation-switch" checked={useLocalGenerator} onCheckedChange={handleUseLocalChange}/>
                        <Label htmlFor="local-generation-switch" className="font-bold">在浏览器本地生成(beta)</Label>
                    </div>
                     <p className="text-sm text-muted-foreground">
                        启用此选项后，生成深度图功能将完全在浏览器本地进行，生成过程中设备内存占用会短暂升高，根据处理器性能单张处理时长可能在几秒到十几秒不等。首次使用此功能需要连接到国际互联网下载模型。
                    </p>
                    <div className="flex items-center space-x-2">
                        <Switch id="mirror-switch" checked={useMirror} onCheckedChange={handleUseMirrorChange}/>
                        <Label htmlFor="mirror-switch">
                            使用镜像站下载模型 (
                            <a
                                href="https://www.modelscope.cn/models"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline hover:text-primary/80"
                                onClick={(e) => e.stopPropagation()}
                            >
                                魔搭社区
                            </a>
                            )
                        </Label>
                    </div>
                     <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <Label htmlFor="local-model-select">本地模型选择</Label>
                                <div className="text-sm text-muted-foreground">
                                    运行环境: {localGeneratorDevice}
                                </div>
                            </div>
                             <Select value={localModelName} onValueChange={handleLocalModelChange}>
                                <SelectTrigger id="local-model-select">
                                    <SelectValue placeholder="选择一个模型" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="onnx-community/depth-anything-v2-small">Small (速度最快)</SelectItem>
                                    <SelectItem value="onnx-community/depth-anything-v2-base">Base (中等)</SelectItem>
                                    <SelectItem value="onnx-community/depth-anything-v2-large">Large (效果较好)</SelectItem>
                                    {/* <SelectItem value="onnx-community/DepthPro-ONNX">DepthPro (效果最好，由 Apple 开源)</SelectItem> */}
                                </SelectContent>
                            </Select>
                        </div>
                        {useLocalGenerator && (
                            <div className="text-sm flex justify-between">
                                <div>
                                    <span className="font-semibold">下载状态:</span> <span className="text-muted-foreground">{localModelStatus}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DialogContent>
    );

    return (
        <Card className="w-full max-w-2xl bg-card/80 backdrop-blur-sm border-border/50 shadow-2xl shadow-black/20">
            <CardHeader className="text-center relative">
                <div className="absolute top-4 right-4 flex items-center gap-2">
                    <Link href="/about" passHref>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Info className="h-5 w-5" />
                        </Button>
                    </Link>
                </div>
                <CardTitle className="text-3xl font-bold">空间照片构建器</CardTitle>
                <CardDescription className="pt-2">
                    上传照片和深度图（Depth Map），为你创建身临其境的空间照片效果。
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FileInputBox 
                        id="image-upload" 
                        onFileSelect={setImageFile} 
                        acceptedFile={imageFile} 
                        label="照片" 
                        description=""
                        icon={<FileImage className="w-10 h-10 mb-3 text-muted-foreground" />}
                        showGenerateButton={true}
                        onGenerateClick={handleGenerateClick}
                        isGenerating={isGenerating}
                        isLocalGenerating={isLocalGenerating}
                        showHelpButton={true}
                        helpDialogContent={helpDialogContent}
                    />
                    <FileInputBox 
                        id="depth-map-upload" 
                        onFileSelect={setDepthMapFile} 
                        acceptedFile={depthMapFile} 
                        label="深度图 (灰度)" 
                        description="颜色从深到浅表示距离由远及近"
                        icon={<UploadCloud className="w-10 h-10 mb-3 text-muted-foreground" />}
                    />
                </div>
                <Button onClick={handleSubmit} disabled={!imageFile || !depthMapFile} size="lg" className="w-full text-lg py-6">
                    构建3D场景
                </Button>
            </CardContent>
        </Card>
    );
}

    
